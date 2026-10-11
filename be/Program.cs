using System.Security.Cryptography;
using System.Text;
using dotenv.net;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using SscrubServer;
using SscrubServer.Extensions;

DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddServices(builder.Configuration);

var app = builder.Build();

app.UseResponseCompression();

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

app.Run();
