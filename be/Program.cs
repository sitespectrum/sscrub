using dotenv.net;
using Microsoft.EntityFrameworkCore;
using SscrubServer;
using SscrubServer.Endpoints;
using SscrubServer.Extensions;

DotEnv.Load();

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddServices(builder.Configuration);

var app = builder.Build();
app.ApplyPreMapConfig();

using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var context = services.GetRequiredService<SscrubDbContext>();

    await context.Database.MigrateAsync();
}

app.MapGet("/", () =>
    TypedResults.Ok(new ServerInfoResponse("sscrub server")));

app.MapSinkEndpoints();
app.MapAssetAndUploadEndpoints();
app.MapStatisticsEndpoints();

app.ApplyPostMapConfig();
app.Run();
