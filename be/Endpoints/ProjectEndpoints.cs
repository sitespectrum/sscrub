using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SscrubServer.Models;

namespace SscrubServer.Endpoints;

public static class ProjectEndpoints
{
    public static void MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/projects", async (SscrubDbContext db) =>
        {
            var projects = await db.Projects
                .Include(x => x.Flags)
                .Include(x => x.Markers)
                .AsSplitQuery()
                .OrderByDescending(x => x.UpdatedAt)
                .ToListAsync();
            var sinkIds = await db.Sinks.Select(x => x.Id).ToHashSetAsync();

            return TypedResults.Ok(projects.Select(x => ToResponse(x, sinkIds)).ToList());
        });

        app.MapGet("/api/projects/{id:guid}", async Task<Results<Ok<ProjectResponse>, NotFound>> (
            Guid id,
            SscrubDbContext db) =>
        {
            var project = await LoadAsync(db, id);
            if (project is null) return TypedResults.NotFound();

            return TypedResults.Ok(ToResponse(project, await db.Sinks.Select(x => x.Id).ToHashSetAsync()));
        });

        app.MapPost("/api/projects", async Task<Results<Created<ProjectResponse>, BadRequest<ErrorResponse>>> (
            ProjectBody body,
            SscrubDbContext db) =>
        {
            var sinkIds = await db.Sinks.Select(x => x.Id).ToHashSetAsync();
            if (Validate(body, sinkIds) is { } error)
                return TypedResults.BadRequest(new ErrorResponse(error));

            var now = DateTime.UtcNow;
            var project = new Project
            {
                Id = Guid.CreateVersion7(),
                Name = body.Name.Trim(),
                Start = body.Start,
                End = body.End,
                SinkIds = body.SinkIds.Distinct().ToList(),
                CreatedAt = now,
                UpdatedAt = now,
            };

            db.Projects.Add(project);
            await db.SaveChangesAsync();

            return TypedResults.Created($"/api/projects/{project.Id}", ToResponse(project, sinkIds));
        });

        app.MapPut("/api/projects/{id:guid}", async Task<Results<Ok<ProjectResponse>, BadRequest<ErrorResponse>, NotFound>> (
            Guid id,
            ProjectBody body,
            SscrubDbContext db) =>
        {
            var project = await LoadAsync(db, id);
            if (project is null) return TypedResults.NotFound();

            var sinkIds = await db.Sinks.Select(x => x.Id).ToHashSetAsync();
            if (Validate(body, sinkIds) is { } error)
                return TypedResults.BadRequest(new ErrorResponse(error));

            project.Name = body.Name.Trim();
            project.Start = body.Start;
            project.End = body.End;
            project.SinkIds = body.SinkIds.Distinct().ToList();
            project.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return TypedResults.Ok(ToResponse(project, sinkIds));
        });

        app.MapDelete("/api/projects/{id:guid}", async Task<Results<NoContent, NotFound>> (
            Guid id,
            SscrubDbContext db) =>
        {
            var deleted = await db.Projects.Where(x => x.Id == id).ExecuteDeleteAsync();
            return deleted == 0 ? TypedResults.NotFound() : TypedResults.NoContent();
        });

        // Flags: a null flag clears the decision.
        app.MapPut("/api/projects/{id:guid}/flags/{assetId:guid}", async Task<Results<NoContent, NotFound>> (
            Guid id,
            Guid assetId,
            SetFlagBody body,
            SscrubDbContext db) =>
        {
            var project = await db.Projects.FirstOrDefaultAsync(x => x.Id == id);
            if (project is null || !await db.Assets.AnyAsync(x => x.Id == assetId))
                return TypedResults.NotFound();

            var existing = await db.ProjectFlags.FindAsync(id, assetId);
            if (body.Flag is { } flag)
            {
                if (existing is null)
                    db.ProjectFlags.Add(new ProjectFlag { ProjectId = id, AssetId = assetId, Flag = flag });
                else
                    existing.Flag = flag;
            }
            else if (existing is not null)
            {
                db.ProjectFlags.Remove(existing);
            }

            project.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return TypedResults.NoContent();
        });

        app.MapPost("/api/projects/{id:guid}/markers", async Task<Results<Created<ProjectMarker>, BadRequest<ErrorResponse>, NotFound>> (
            Guid id,
            MarkerBody body,
            SscrubDbContext db) =>
        {
            var project = await db.Projects.FirstOrDefaultAsync(x => x.Id == id);
            if (project is null) return TypedResults.NotFound();
            if (string.IsNullOrWhiteSpace(body.Label))
                return TypedResults.BadRequest(new ErrorResponse("Label can not be empty"));

            var marker = new ProjectMarker
            {
                Id = Guid.CreateVersion7(),
                ProjectId = id,
                Time = body.Time,
                Label = body.Label.Trim(),
                Color = body.Color,
            };
            db.ProjectMarkers.Add(marker);
            project.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return TypedResults.Created($"/api/projects/{id}/markers/{marker.Id}", marker);
        });

        app.MapPut("/api/projects/{id:guid}/markers/{markerId:guid}", async Task<Results<Ok<ProjectMarker>, BadRequest<ErrorResponse>, NotFound>> (
            Guid id,
            Guid markerId,
            MarkerBody body,
            SscrubDbContext db) =>
        {
            var marker = await db.ProjectMarkers
                .Include(x => x.Project)
                .FirstOrDefaultAsync(x => x.Id == markerId && x.ProjectId == id);
            if (marker is null) return TypedResults.NotFound();
            if (string.IsNullOrWhiteSpace(body.Label))
                return TypedResults.BadRequest(new ErrorResponse("Label can not be empty"));

            marker.Time = body.Time;
            marker.Label = body.Label.Trim();
            marker.Color = body.Color;
            marker.Project.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return TypedResults.Ok(marker);
        });

        app.MapDelete("/api/projects/{id:guid}/markers/{markerId:guid}", async Task<Results<NoContent, NotFound>> (
            Guid id,
            Guid markerId,
            SscrubDbContext db) =>
        {
            var marker = await db.ProjectMarkers
                .Include(x => x.Project)
                .FirstOrDefaultAsync(x => x.Id == markerId && x.ProjectId == id);
            if (marker is null) return TypedResults.NotFound();

            db.ProjectMarkers.Remove(marker);
            marker.Project.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return TypedResults.NoContent();
        });
    }

    private static Task<Project?> LoadAsync(SscrubDbContext db, Guid id) =>
        db.Projects
            .Include(x => x.Flags)
            .Include(x => x.Markers)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id);

    private static string? Validate(ProjectBody body, HashSet<Guid> sinkIds)
    {
        if (string.IsNullOrWhiteSpace(body.Name)) return "Name can not be empty";
        if (body.End <= body.Start) return "End must be after start";
        if (body.SinkIds.Count == 0) return "Pick at least one sink";
        if (body.SinkIds.FirstOrDefault(x => !sinkIds.Contains(x)) is var missing && missing != Guid.Empty)
            return $"Cannot find sink {missing}";
        return null;
    }

    private static ProjectResponse ToResponse(Project p, HashSet<Guid> sinkIds) => new(
        p.Id,
        p.Name,
        p.Start,
        p.End,
        p.SinkIds.Where(sinkIds.Contains).ToList(),
        p.CreatedAt,
        p.UpdatedAt,
        p.Flags.Select(f => new ProjectFlagItem(f.AssetId, f.Flag)).ToList(),
        p.Markers.OrderBy(m => m.Time).ToList());
}
