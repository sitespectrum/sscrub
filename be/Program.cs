using System.Net;
using System.Security.Cryptography;
using System.Text;
using Amazon.S3;
using Amazon.S3.Model;
using dotenv.net;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
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

// DB Migrate
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var context = services.GetRequiredService<SscrubDbContext>();

    await context.Database.MigrateAsync();
}

app.MapGet("/", (IConfiguration configuration, string objectKey) =>
{
    var _secret = Encoding.UTF8.GetBytes(configuration.GetSection("Secrets").GetValue<string>("UrlSigningSecret") ?? "");
    var _lifetimeSeconds = (long)86_400;

    var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    var expires = (now / _lifetimeSeconds + 2) * _lifetimeSeconds;

    var path = "/" + objectKey.TrimStart('/');
    var signature = HMACSHA256.HashData(_secret, Encoding.UTF8.GetBytes($"{expires}\n{path}"));

    var encodedPath = string.Join('/', path.Split('/').Select(Uri.EscapeDataString));

    return $"{encodedPath}?exp={expires}&sig={WebEncoders.Base64UrlEncode(signature)}";
});

app.MapGet("/api/sinks", (SscrubDbContext db) =>
{
    return Results.Ok(db.Sinks.Select(x => new { x.Id, x.Name }));
});

app.MapPost("/api/sinks", async (SscrubDbContext db, CreateSinkBody body) =>
{
    if (string.IsNullOrWhiteSpace(body.Name)) return Results.BadRequest(new
    {
        error = "Name can not be empty"
    });

    var sink = new Sink
    {
        Id = Guid.CreateVersion7(),
        Name = body.Name
    };

    await db.Sinks.AddAsync(sink);
    await db.SaveChangesAsync();

    return Results.Json(new
    {
        sink.Id,
        sink.Name
    }, statusCode: (int)HttpStatusCode.Created);
});

app.MapPost("/api/uploads", async (
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

    return Results.Json(new
    {
        asset.Id,
        partSize,
        urls
    }, statusCode: (int)HttpStatusCode.Created);
});

app.MapPost("/api/uploads/{id:guid}/complete", async (
    Guid id,
    SscrubDbContext db,
    [FromKeyedServices("asset")] IAmazonS3 s3,
    IOptions<AssetStorageBucketOptions> assetS3Options,
    CompleteUploadBody body) =>
{
    var asset = await db.Assets.FirstOrDefaultAsync(x => x.Id == id);
    if (asset is null) return Results.NotFound();

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

    return Results.Accepted();
});

app.MapGet("/api/assets/{id:guid}/presignedUrl", async (Guid id, SscrubDbContext db, AssetUrlSigner signer) =>
{
    var asset = await db.Assets.FirstOrDefaultAsync(x => x.Id == id);
    if (asset is null) return Results.NotFound();

    var url = signer.Sign(asset.ObjectKey);

    return Results.Redirect(url);
});

app.Run();
