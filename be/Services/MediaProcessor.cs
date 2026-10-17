using System.Globalization;
using System.Text.Json;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using SscrubServer.Models;
using SscrubServer.Options;

namespace SscrubServer.Services;

public class MediaProcessor(
  [FromKeyedServices("asset")] IAmazonS3 assetS3,
  [FromKeyedServices("derived")] IAmazonS3 derivedS3,
  IOptions<AssetStorageBucketOptions> assetBucket,
  IOptions<DerivedStorageBucketOptions> derivedBucket,
  IOptions<MediaProcessingOptions> options,
  AssetUrlSigner signer,
  MediaProcessingErrors errors)
{
    private const int FrameWidth = 320, FrameHeight = 214, MaxFrames = 100, MaxColumns = 10;

    private static readonly JsonSerializerOptions ProbeJson = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    public async Task ProcessAssetAsync(Asset asset, CancellationToken ct)
    {
        try
        {
            await ProcessAssetCoreAsync(asset, ct);
            errors.Clear(asset.Id);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            errors.Set(asset.Id, ex.Message);
            throw;
        }
    }

    private async Task ProcessAssetCoreAsync(Asset asset, CancellationToken ct)
    {
        var opt = options.Value;
        var source = signer.Sign(asset.ObjectKey);

        asset.HeadHash = await HeadHashAsync(asset.ObjectKey, opt.HeadHashBytes, ct);

        var probeResults = await ProbeAssetAsync(source, ct);

        var durationMs = ParseDurationMillis(probeResults);
        asset.DurationMillis = durationMs;
        asset.ContentType = ResolveContentType(probeResults) ?? asset.ContentType;

        if (TryGetTag(probeResults.Format.Tags, "creation_time", out var created)
            && DateTime.TryParse(created, Inv, DateTimeStyles.AdjustToUniversal, out var captured))
        {
            asset.CaptureDate ??= captured;
        }

        if (!(probeResults.Streams ?? []).Any(IsRealVideo)) return;

        var workDir = Path.Combine(opt.WorkDir, asset.Id.ToString());
        Directory.CreateDirectory(workDir);
        try
        {
            asset.ThumbnailKey = await RenderThumbnailAsync(asset.Id, source, workDir, durationMs, ct);
            asset.Filmstrip = await RenderFilmstripAsync(asset.Id, source, workDir, durationMs, ct);
        }
        finally
        {
            Directory.Delete(workDir, recursive: true);
        }
    }

    public async Task<string> HeadHashAsync(string Key, long headBytes, CancellationToken ct)
    {
        using var response = await assetS3.GetObjectAsync(new()
        {
            BucketName = assetBucket.Value.Bucket,
            Key = Key,
            ByteRange = new(0, headBytes - 1)
        }, ct);

        using var hasher = Blake3.Hasher.New();
        var buffer = new byte[headBytes];
        int read;
        while ((read = await response.ResponseStream.ReadAsync(buffer, ct)) > 0)
        {
            hasher.Update(buffer.AsSpan(0, read));
        }

        return hasher.Finalize().ToString();
    }

    private static string[] HttpInputArgs(string url) => [
        "-reconnect", "1",
        "-reconnect_on_network_error", "1",
        "-reconnect_delay_max", "5",
        "-rw_timeout", 30_000_000.ToString(),
        "-i", url
    ];

    private async Task<FfprobeResult> ProbeAssetAsync(string url, CancellationToken ct)
    {
        var jsonRes = await ProcessRunner.RunAsync(
            options.Value.FfprobePath,
            [
                "-v", "error",
                "-print_format", "json",
                "-show_format", "-show_streams",
                ..HttpInputArgs(url)
            ],
            ct
        );

        return JsonSerializer.Deserialize<FfprobeResult>(jsonRes, ProbeJson)
            ?? throw new InvalidOperationException("ffprobe returned no output");
    }

    private static long ParseDurationMillis(FfprobeResult probe)
    {
        var seconds = new[] { probe.Format.Duration }
            .Concat((probe.Streams ?? []).Select(x => x.Duration))
            .Max(x => double.TryParse(x, Inv, out var secs) ? secs : 0);

        if (seconds <= 0) throw new InvalidOperationException("Could not determine duration");
        return (long)Math.Round(seconds * 1000);
    }

    private static bool IsRealVideo(FfprobeStream stream) =>
        stream.CodecType == "video" &&
        (stream.Disposition?.GetValueOrDefault("attached_pic") ?? 0) == 0;

    private static bool TryGetTag(Dictionary<string, string>? tags, string name, out string? value)
    {
        value = tags?.FirstOrDefault(t => t.Key.Equals(name, StringComparison.OrdinalIgnoreCase)).Value;
        return value is not null;
    }

    private static string? ResolveContentType(FfprobeResult probe)
    {
        var streams = probe.Streams ?? [];
        var hasVideo = streams.Any(IsRealVideo);
        var formats = probe.Format.FormatName.Split(',');

        if (formats.Contains("mov"))
        {
            TryGetTag(probe.Format.Tags, "major_brand", out var brand);
            return brand?.Trim() == "qt" ? "video/quicktime" : hasVideo ? "video/mp4" : "audio/mp4";
        }

        if (formats.Contains("matroska"))
        {
            string[] webmCodecs = ["vp8", "vp9", "av1", "opus", "vorbis"];
            var isWebm = streams.All(x => x.CodecName is { } c && webmCodecs.Contains(c));
            return isWebm ? (hasVideo ? "video/webm" : "audio/webm") : "video/x-matroska";
        }

        return formats[0] switch
        {
            "wav" => "audio/wav",
            "mp3" => "audio/mpeg",
            "flac" => "audio/flac",
            "mpegts" => "video/mp2t",
            "avi" => "video/x-msvideo",
            _ => null
        };
    }

    private static string FramePath(string dir, int i) => Path.Combine(dir, $"f{i:D3}.png");

    private static void FillMissingFrames(string dir, int frames)
    {
        var first = Enumerable.Range(0, frames).Select(i => FramePath(dir, i)).FirstOrDefault(File.Exists)
            ?? throw new InvalidOperationException("No filmstrip frames could be extracted");
        var previous = first;
        for (var i = 0; i < frames; i++)
        {
            var path = FramePath(dir, i);
            if (File.Exists(path)) previous = path;
            else File.Copy(previous, path);
        }
    }

    private async Task<string> RenderThumbnailAsync(Guid id, string url, string workDir, long durationMs, CancellationToken ct)
    {
        var randomKey = Guid.NewGuid().ToString("N")[..12];

        var output = Path.Combine(workDir, "thumb.webp");

        var seekSec = Math.Min(5000, durationMs / 5) / 1000.0;

        await ProcessRunner.RunAsync(options.Value.FfmpegPath,
        [
            "-v", "error", "-y",
            "-ss", seekSec.ToString("0.###", Inv),
            .. HttpInputArgs(url),
            "-frames:v", "1", "-an",
            "-vf", "scale=640:-2,thumbnail=30",
            "-c:v", "libwebp", "-quality", "80",
            output,
        ], ct);


        return await UploadAsync($"thumbs/{id}/{randomKey}.webp", output, ct);
    }

    private async Task<string> UploadAsync(string key, string path, CancellationToken ct)
    {
        await derivedS3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = derivedBucket.Value.Bucket,
            Key = key,
            FilePath = path,
            ContentType = "image/webp",
            DisablePayloadSigning = true,
        }, ct);
        return key;
    }

    private async Task<FilmstripInfo> RenderFilmstripAsync(Guid id, string url, string workDir, long durationMs, CancellationToken ct)
    {
        var randomKey = Guid.NewGuid().ToString("N")[..12];

        var o = options.Value;
        var frames = Math.Clamp((int)Math.Ceiling(durationMs / 1000.0), 1, MaxFrames);
        var columns = Math.Min(MaxColumns, frames);
        var rows = (frames + columns - 1) / columns;
        var intervalMs = Math.Max(1, durationMs / frames);
        var fit = $"scale={FrameWidth}:{FrameHeight}:force_original_aspect_ratio=decrease," +
                  $"pad={FrameWidth}:{FrameHeight}:(ow-iw)/2:(oh-ih)/2";

        await Parallel.ForEachAsync(
            Enumerable.Range(0, frames),
            new ParallelOptions { MaxDegreeOfParallelism = o.SeekConcurrency, CancellationToken = ct },
            async (i, ct) =>
            {
                var t = (i + 0.5) * intervalMs / 1000.0;
                await ProcessRunner.RunAsync(o.FfmpegPath,
                [
                    "-v", "error", "-y",
                    "-noaccurate_seek", "-skip_frame", "nokey",
                    "-ss", t.ToString("0.###", Inv),
                    .. HttpInputArgs(url),
                    "-frames:v", "1", "-an",
                    "-vf", fit,
                    FramePath(workDir, i),
                ], ct);
            });

        FillMissingFrames(workDir, frames);

        var output = Path.Combine(workDir, "filmstrip.webp");
        await ProcessRunner.RunAsync(o.FfmpegPath,
        [
            "-v", "error", "-y",
            "-framerate", "1", "-i", Path.Combine(workDir,"f%03d.png"),
            "-vf", $"tile={columns}x{rows}",
            "-frames:v", "1",
            "-c:v", "libwebp", "-quality", "70",
            output,
        ], ct);

        return new FilmstripInfo
        {
            ObjectKey = await UploadAsync($"filmstrips/{id}/{randomKey}.webp", output, ct),
            FrameCount = frames,
            Columns = columns,
            FrameWidth = FrameWidth,
            FrameHeight = FrameHeight,
            IntervalMillis = intervalMs,
        };
    }

}