using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SscrubServer.Models;
using SscrubServer.Options;
using SscrubServer.Services;

namespace SscrubServer.Endpoints;

public static class AssetAndUploadEndpoints
{
    public static void MapAssetAndUploadEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/uploads", async Task<Created<StartUploadResponse>> (
            [FromKeyedServices("asset")] IAmazonS3 s3,
            SscrubDbContext db,
            IOptions<AssetStorageBucketOptions> assetS3Options,
            StartUploadBody body) =>
        {
            var asset = new Asset
            {
                Id = Guid.CreateVersion7(),
                FileName = body.FileName,
                SinkId = body.SinkId,
                UploadDate = DateTime.UtcNow,
                ContentType = body.ContentType,
                Status = AssetStatus.Uploading
            };
            asset.ObjectKey = $"assets/{asset.Id}";

            Console.WriteLine(assetS3Options.Value.Bucket);
            var multiPartUpload = await s3.InitiateMultipartUploadAsync(
                new()
                {
                    BucketName = assetS3Options.Value.Bucket,
                    Key = asset.ObjectKey,
                    ContentType = body.ContentType
                }
            );
            asset.UploadId = multiPartUpload.UploadId;

            await db.Assets.AddAsync(asset);
            await db.SaveChangesAsync();

            var partSize = Math.Max(32L << 20, (body.Size + 9_999) / 10_000);
            var partCount = (int)((body.Size + partSize - 1) / partSize);

            var urls = new List<string>(partCount);
            for (var n = 1; n <= partCount; n++)
            {
                urls.Add(await s3.GetPreSignedURLAsync(new()
                {
                    BucketName = assetS3Options.Value.Bucket,
                    Key = asset.ObjectKey,
                    Verb = HttpVerb.PUT,
                    UploadId = multiPartUpload.UploadId,
                    PartNumber = n,
                    Expires = DateTime.UtcNow.AddHours(12),
                    Protocol = s3.Config.ServiceURL.StartsWith("http://") ? Protocol.HTTP : Protocol.HTTPS
                }));
            }

            return TypedResults.Created($"/api/uploads/{asset.Id}", new StartUploadResponse(asset.Id, partSize, urls));
        });

        app.MapPost("/api/uploads/{id:guid}/complete", async Task<Results<Accepted, NotFound>> (
            Guid id,
            SscrubDbContext db,
            [FromKeyedServices("asset")] IAmazonS3 s3,
            IOptions<AssetStorageBucketOptions> assetS3Options,
            MediaProcessingQueue queue,
            CompleteUploadBody body) =>
        {
            var asset = await db.Assets.FirstOrDefaultAsync(x => x.Id == id);
            if (asset is null) return TypedResults.NotFound();

            await s3.CompleteMultipartUploadAsync(new()
            {
                BucketName = assetS3Options.Value.Bucket,
                Key = asset.ObjectKey,
                UploadId = asset.UploadId,
                PartETags = [.. body.Parts.Select(x => new PartETag(x.PartNumber, x.ETag))]
            });

            var head = await s3.GetObjectMetadataAsync(assetS3Options.Value.Bucket, asset.ObjectKey);
            asset.Size = head.ContentLength;
            asset.Status = AssetStatus.Processing;
            await db.SaveChangesAsync();

            await queue.EnqueueAsync(id);

            return TypedResults.Accepted((string?)null);
        });

        app.MapDelete("/api/uploads/{id:guid}", async Task<Results<Ok, NotFound>> (
            Guid id,
            SscrubDbContext db,
            [FromKeyedServices("asset")] IAmazonS3 s3,
            IOptions<AssetStorageBucketOptions> assetS3Options) =>
        {
            var asset = await db.Assets.FirstOrDefaultAsync(x => x.Id == id);
            if (asset is null) return TypedResults.NotFound();

            await s3.AbortMultipartUploadAsync(new()
            {
                BucketName = assetS3Options.Value.Bucket,
                Key = asset.ObjectKey,
                UploadId = asset.UploadId,
            });

            db.Assets.Remove(asset);
            await db.SaveChangesAsync();

            return TypedResults.Ok();
        });

        app.MapGet("/api/assets", async (SscrubDbContext db, Guid? sinkId = null) =>
        {
            var query = db.Assets.AsQueryable();

            if (sinkId is not null)
            {
                query = query.Where(x => x.SinkId == sinkId);
            }

            return TypedResults.Ok(await query.ToListAsync());
        });

        app.MapGet("/api/assets/attention", async (SscrubDbContext db, MediaProcessingErrors errors) =>
        {
            var failed = await db.Assets
                .Where(x => x.Status == AssetStatus.Failed)
                .ToListAsync();

            return TypedResults.Ok(failed
                .Select(asset => (asset, error: errors.Get(asset.Id)))
                .Select(x => new AttentionItem(x.asset, x.error?.Message, x.error?.FailedAt))
                .OrderByDescending(x => x.FailedAt)
                .ToList());
        });

        app.MapGet("/api/assets/{id:guid}/presignedUrl", async Task<Results<RedirectHttpResult, NotFound>> (
            Guid id,
            SscrubDbContext db,
            AssetUrlSigner signer) =>
        {
            var asset = await db.Assets.FirstOrDefaultAsync(x => x.Id == id);
            if (asset is null) return TypedResults.NotFound();

            var url = signer.Sign(asset.ObjectKey);

            return TypedResults.Redirect(url);
        });

        app.MapDelete("/api/assets/{id:guid}", async Task<Results<NoContent, NotFound>> (
            Guid id,
            SscrubDbContext db,
            [FromKeyedServices("asset")] IAmazonS3 assetS3,
            [FromKeyedServices("derived")] IAmazonS3 derivedS3,
            IOptions<AssetStorageBucketOptions> assetBucket,
            IOptions<DerivedStorageBucketOptions> derivedBucket,
            MediaProcessingErrors errors) =>
        {
            var asset = await db.Assets.FirstOrDefaultAsync(x => x.Id == id);
            if (asset is null) return TypedResults.NotFound();

            db.Remove(asset);
            errors.Clear(id);

            if (asset.Status is AssetStatus.Uploading)
                try
                {
                    await assetS3.AbortMultipartUploadAsync(new()
                    {
                        BucketName = assetBucket.Value.Bucket,
                        Key = asset.ObjectKey,
                        UploadId = asset.UploadId
                    });

                }
                catch { }

            try
            {
                await assetS3.DeleteObjectAsync(new()
                {
                    BucketName = assetBucket.Value.Bucket,
                    Key = asset.ObjectKey
                });
            }
            catch { }

            if (!string.IsNullOrWhiteSpace(asset.ThumbnailKey))
                try
                {
                    await derivedS3.DeleteObjectAsync(new()
                    {
                        BucketName = derivedBucket.Value.Bucket,
                        Key = asset.ThumbnailKey
                    });
                }
                catch { }

            if (!string.IsNullOrWhiteSpace(asset.Filmstrip?.ObjectKey))
                try
                {
                    await derivedS3.DeleteObjectAsync(new()
                    {
                        BucketName = derivedBucket.Value.Bucket,
                        Key = asset.Filmstrip?.ObjectKey
                    });
                }
                catch { }

            await db.SaveChangesAsync();

            return TypedResults.NoContent();
        });
    }

}