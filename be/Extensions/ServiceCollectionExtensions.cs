using System.Text.Json.Serialization;
using Amazon.S3;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;
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

        var derivedS3Options = configuration.GetRequiredSection(DerivedStorageBucketOptions.SectionName).Get<DerivedStorageBucketOptions>() ?? new();
        services.AddKeyedSingleton<IAmazonS3>("derived", (_, __) => new AmazonS3Client(derivedS3Options.AccessKey, derivedS3Options.SecretKey, new AmazonS3Config
        {
            ForcePathStyle = true,
            ServiceURL = derivedS3Options.Endpoint,
            AuthenticationRegion = derivedS3Options.Region,
            RequestChecksumCalculation = Amazon.Runtime.RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = Amazon.Runtime.ResponseChecksumValidation.WHEN_REQUIRED,
        }));

        services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
        });

        services.AddEndpointsApiExplorer();
        services.AddOpenApi(options =>
        {
            options.AddDocumentTransformer((document, context, cancellationToken) =>
                {
                    document.Components ??= new OpenApiComponents();
                    document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();

                    document.Components.SecuritySchemes.Add("Bearer", new OpenApiSecurityScheme
                    {
                        Type = SecuritySchemeType.Http,
                        Scheme = "bearer",
                        BearerFormat = "JWT",
                        Description = "Enter your JWT token"
                    });

                    return Task.CompletedTask;
                });
        });

        services.AddSingleton<AssetUrlSigner>();
        services.AddSingleton<MediaProcessingQueue>();
        services.AddScoped<MediaProcessor>();
        services.AddHostedService<MediaProcessingWorker>();

        services.AddProblemDetails();

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

        services.AddOptions<MediaProcessingOptions>()
            .BindConfiguration(MediaProcessingOptions.SectionName);

        services.AddOptions<DerivedStorageBucketOptions>()
            .BindConfiguration(DerivedStorageBucketOptions.SectionName);

        return services;
    }

}