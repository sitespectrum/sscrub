using Scalar.AspNetCore;

namespace SscrubServer.Extensions;

internal static class WebApplicationExtensions
{
    internal static WebApplication ApplyPreMapConfig(this WebApplication app)
    {
        app.UseResponseCompression();

        app.UseCors(conf =>
            conf.AllowAnyOrigin()
                .AllowAnyHeader()
                .AllowAnyMethod());

        app.UseExceptionHandler();

        app.UseStatusCodePages();

        return app;
    }

    internal static WebApplication ApplyPostMapConfig(this WebApplication app)
    {
        app.MapOpenApi();

        if (app.Environment.IsDevelopment())
        {
            app.MapScalarApiReference();
        }

        return app;
    }

}