using Amazon.S3;
using Amazon.S3.Model;
using dotenv.net;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Scalar.AspNetCore;
using SscrubServer;
using SscrubServer.Extensions;
using SscrubServer.Models;
using SscrubServer.Options;
using SscrubServer.Services;

DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddServices(builder.Configuration);

var app = builder.Build();

app.UseResponseCompression();

app.UseCors(conf =>
    conf.AllowAnyOrigin()
        .AllowAnyHeader()
        .AllowAnyMethod());

app.UseExceptionHandler();

app.UseStatusCodePages();

// DB Migrate
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var context = services.GetRequiredService<SscrubDbContext>();

    await context.Database.MigrateAsync();
}

app.MapGet("/", (IConfiguration configuration, string objectKey) =>
    TypedResults.Ok(new ServerInfoResponse("sscrub server")));

app.MapGet("/api/sinks", async (SscrubDbContext db) =>
{
    return TypedResults.Ok(await db.Sinks.ToListAsync());
});

app.MapPost("/api/sinks", async Task<Results<Created<Sink>, BadRequest<ErrorResponse>>> (
    SscrubDbContext db,
    CreateSinkBody body) =>
{
    if (string.IsNullOrWhiteSpace(body.Name))
        return TypedResults.BadRequest(new ErrorResponse("Name can not be empty"));

    var sink = new Sink
    {
        Id = Guid.CreateVersion7(),
        Name = body.Name
    };

    await db.Sinks.AddAsync(sink);
    await db.SaveChangesAsync();

    return TypedResults.Created($"/api/sinks/{sink.Id}", sink);
});

app.MapGet("/api/sinks/{id:guid}", async Task<Results<Ok<Sink>, NotFound>> (
    Guid id,
    SscrubDbContext db) =>
{
    var sink = await db.Sinks.FirstOrDefaultAsync(x => x.Id == id);
    if (sink is null) return TypedResults.NotFound();

    return TypedResults.Ok(sink);
});

app.MapDelete("/api/sinks/{id:guid}", async Task<Results<Ok, NotFound>> (
    Guid id,
    SscrubDbContext db) =>
{
    var sink = await db.Sinks.FirstOrDefaultAsync(x => x.Id == id);
    if (sink is null) return TypedResults.NotFound();

    db.Sinks.Remove(sink);
    await db.SaveChangesAsync();

    return TypedResults.Ok();
});

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

app.MapOpenApi();

if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference();
}

app.Run();
