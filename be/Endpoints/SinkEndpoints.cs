using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SscrubServer.Models;

namespace SscrubServer.Endpoints;

public static class SinkEndpoints
{
    public static void MapSinkEndpoints(this IEndpointRouteBuilder app)
    {
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

            if (string.IsNullOrWhiteSpace(body.Model))
                return TypedResults.BadRequest(new ErrorResponse("Model can not be empty"));

            if (string.IsNullOrWhiteSpace(body.Type))
                return TypedResults.BadRequest(new ErrorResponse("Type can not be empty"));

            var color = string.IsNullOrWhiteSpace(body.Color) ? "blue" : body.Color;

            var sink = new Sink
            {
                Id = Guid.CreateVersion7(),
                Name = body.Name,
                Model = body.Model,
                Type = body.Type,
                Color = color
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

        app.MapPut("/api/sinks/{id:guid}", async Task<Results<Ok<Sink>, BadRequest<ErrorResponse>, NotFound<ErrorResponse>>> (
            Guid id,
            CreateSinkBody body,
            SscrubDbContext db) =>
        {
            var sink = await db.Sinks.FirstOrDefaultAsync(x => x.Id == id);
            if (sink is null) return TypedResults.NotFound(new ErrorResponse($"Cannot find sink {id}"));

            if (string.IsNullOrWhiteSpace(body.Name))
                return TypedResults.BadRequest(new ErrorResponse("Name can not be empty"));

            if (string.IsNullOrWhiteSpace(body.Model))
                return TypedResults.BadRequest(new ErrorResponse("Model can not be empty"));

            if (string.IsNullOrWhiteSpace(body.Type))
                return TypedResults.BadRequest(new ErrorResponse("Type can not be empty"));

            var color = string.IsNullOrWhiteSpace(body.Color) ? "blue" : body.Color;

            sink.Name = body.Name;
            sink.Model = body.Model;
            sink.Type = body.Type;
            sink.Color = color;

            await db.SaveChangesAsync();

            return TypedResults.Ok(sink);
        });

        app.MapDelete("/api/sinks/{id:guid}", async Task<Results<NoContent, NotFound>> (
            Guid id,
            SscrubDbContext db) =>
        {
            var sink = await db.Sinks.FirstOrDefaultAsync(x => x.Id == id);
            if (sink is null) return TypedResults.NotFound();

            db.Sinks.Remove(sink);
            await db.SaveChangesAsync();

            return TypedResults.NoContent();
        });
    }

}