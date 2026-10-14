using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace SscrubServer.Endpoints;

public static class StatisticsEndpoints
{
    public static void MapStatisticsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/stats/library", async Task<Ok<LibraryStatsResponse>> (SscrubDbContext db) =>
        {
            var overall = new LibraryStats(
                Count: db.Assets.Count(),
                Size: db.Assets.Sum(x => x.Size),
                DurationMillis: db.Assets.Sum(x => x.DurationMillis)
            );

            var bySinks = await db.Sinks.Select(sink => new SinkLibraryStats(
                SinkId: sink.Id,
                Count: sink.Assets.Count(),
                Size: sink.Assets.Sum(x => x.Size),
                DurationMillis: sink.Assets.Sum(x => x.DurationMillis)
            )).ToListAsync();

            return TypedResults.Ok(new LibraryStatsResponse(
                overall,
                bySinks
            ));
        });
    }

}