using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SscrubServer.Models;
using SscrubServer.Options;

namespace SscrubServer.Services;

public class MediaProcessingWorker(
    MediaProcessingQueue queue,
    IServiceScopeFactory scopeFactory,
    IOptions<MediaProcessingOptions> options,
    ILogger<MediaProcessingWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SscrubDbContext>();
        var stuckAssets = await db.Assets
            .Where(x => x.Status == AssetStatus.Processing || x.Status == AssetStatus.Failed)
            .Select(x => x.Id)
            .ToListAsync(ct);

        foreach (var id in stuckAssets)
        {
            await queue.EnqueueAsync(id, ct);
        }

        await Parallel.ForEachAsync(
            queue.ReadAllAsync(ct),
            new ParallelOptions
            {
                MaxDegreeOfParallelism = options.Value.MaxConcurrency,
                CancellationToken = ct
            },
            ProcessOneAsync
        );
    }

    private async ValueTask ProcessOneAsync(Guid id, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SscrubDbContext>();
        var processor = scope.ServiceProvider.GetRequiredService<MediaProcessor>();

        var asset = await db.Assets.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (asset is null)
        {
            if (logger.IsEnabled(LogLevel.Warning)) logger.LogWarning("Asset {AssetId} not found", id);
            return;
        }

        if (asset.Status is not (AssetStatus.Processing or AssetStatus.Failed))
        {
            if (logger.IsEnabled(LogLevel.Warning))
                logger.LogWarning("Trying to process asset {AssetId} that is neither Processing nor Failed", id);
            return;
        }

        try
        {
            await processor.ProcessAssetAsync(asset, ct);
            asset.Status = AssetStatus.Ready;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            if (logger.IsEnabled(LogLevel.Error)) logger.LogError(ex, "Processing asset {AssetId} failed", id);
            asset.Status = AssetStatus.Failed;
        }

        await db.SaveChangesAsync(CancellationToken.None);
    }
}