using Amazon.S3;
using Microsoft.EntityFrameworkCore;
using SscrubServer.Options;
using SscrubServer.Services;

namespace SscrubServer.Extensions;

internal static class ServiceCollectionExtensions
{
    internal static IServiceCollection AddServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions();

        services.AddDbContext<SscrubDbContext>(
            options => options.UseSqlite(configuration.GetConnectionString("SscrubDb")));

        var assetS3Options = configuration.GetRequiredSection(AssetStorageBucketOptions.SectionName).Get<AssetStorageBucketOptions>() ?? new();
        services.AddKeyedSingleton<IAmazonS3>("asset", (_, __) => new AmazonS3Client(assetS3Options.AccessKey, assetS3Options.SecretKey, new AmazonS3Config
        {
            ForcePathStyle = true,
            ServiceURL = assetS3Options.Endpoint,
            AuthenticationRegion = assetS3Options.Region,
            RequestChecksumCalculation = Amazon.Runtime.RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = Amazon.Runtime.ResponseChecksumValidation.WHEN_REQUIRED,
        }));

        services.AddSingleton<AssetUrlSigner>();

        services.AddResponseCompression(options => options.EnableForHttps = true);

        services.AddCors();

        return services;
    }

    internal static IServiceCollection AddOptions(this IServiceCollection services)
    {
        services.AddOptions<AssetStorageBucketOptions>()
            .BindConfiguration(AssetStorageBucketOptions.SectionName);

        services.AddOptions<AssetProxyOptions>()
            .BindConfiguration(AssetProxyOptions.SectionName);

        return services;
    }

}