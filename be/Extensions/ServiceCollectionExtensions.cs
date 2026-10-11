using Microsoft.EntityFrameworkCore;

namespace SscrubServer.Extensions;

internal static class ServiceCollectionExtensions
{
    internal static IServiceCollection AddServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<SscrubDbContext>(
            options => options.UseSqlite(configuration.GetConnectionString("SscrubDb")));

        services.AddResponseCompression(options => options.EnableForHttps = true);

        return services;
    }
}