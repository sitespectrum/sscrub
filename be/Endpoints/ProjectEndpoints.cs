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
                .AsNoTracking()
                .OrderByDescending(x => x.UpdatedAt)
                .ToListAsync();
            var sinkTypes = await db.Sinks.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Type);
            var flags = (await db.ProjectFlags.AsNoTracking()
                    .Select(x => new { x.ProjectId, x.AssetId })
                    .ToListAsync())
                .ToLookup(x => x.ProjectId, x => x.AssetId);
            // Bounds the range query: a clip that overlaps the window starts at
            // most this long before it.
            var maxDuration = await db.Assets.MaxAsync(x => (long?)x.DurationMillis) ?? 0;

            var summaries = new List<ProjectSummary>(projects.Count);
            foreach (var p in projects)
            {
                var sinkIds = p.SinkIds.Where(sinkTypes.ContainsKey).ToList();
                var from = p.Start.AddMilliseconds(-maxDuration);
                // Matches the IX_Assets_SinkId_Start expression index.
                var assets = await db.Assets
                    .AsNoTracking()
                    .Where(a => sinkIds.Contains(a.SinkId)
                        && (a.CaptureDate ?? a.UploadDate) < p.End
                        && (a.CaptureDate ?? a.UploadDate) >= from)
                    .ToListAsync();
                summaries.Add(Summarize(p, sinkIds, sinkTypes, assets, flags[p.Id].ToHashSet()));
            }

            return TypedResults.Ok(summaries);
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

        // Creates or updates. Lets the client pick the id, so undo/redo can
        // delete a marker and put the same one back.
        app.MapPut("/api/projects/{id:guid}/markers/{markerId:guid}", async Task<Results<Ok<ProjectMarker>, BadRequest<ErrorResponse>, NotFound>> (
            Guid id,
            Guid markerId,
            MarkerBody body,
            SscrubDbContext db) =>
        {
            var project = await db.Projects.FirstOrDefaultAsync(x => x.Id == id);
            if (project is null) return TypedResults.NotFound();
            if (string.IsNullOrWhiteSpace(body.Label))
                return TypedResults.BadRequest(new ErrorResponse("Label can not be empty"));

            var marker = await db.ProjectMarkers.FirstOrDefaultAsync(x => x.Id == markerId);
            if (marker is null)
            {
                marker = new ProjectMarker { Id = markerId, ProjectId = id };
                db.ProjectMarkers.Add(marker);
            }
            else if (marker.ProjectId != id)
            {
                return TypedResults.NotFound();
            }

            marker.Time = body.Time;
            marker.Label = body.Label.Trim();
            marker.Color = body.Color;
            project.UpdatedAt = DateTime.UtcNow;
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

    private static DateTime StartOf(Asset a) => a.CaptureDate ?? a.UploadDate;
    private static DateTime EndOf(Asset a) => StartOf(a).AddMilliseconds(a.DurationMillis);

    private static ProjectSummary Summarize(
        Project p,
        List<Guid> sinkIds,
        Dictionary<Guid, string> sinkTypes,
        List<Asset> candidates,
        HashSet<Guid> flagged)
    {
        var clips = candidates
            .Where(a => StartOf(a) < p.End && EndOf(a) > p.Start)
            .OrderBy(StartOf)
            .ToList();
        var bySink = clips.ToLookup(a => a.SinkId);
        var posterT = p.Start + (p.End - p.Start) * 0.4;
        // Gaps under ~1px on a card-sized bar aren't visible, so bridge them.
        var mergeGap = (p.End - p.Start) * 0.002;

        var sinks = sinkIds.Select(id =>
        {
            var cs = bySink[id].ToList();
            var poster = sinkTypes[id] == "audio"
                ? null
                : cs.FirstOrDefault(a => StartOf(a) <= posterT && posterT < EndOf(a))
                    ?? cs.FirstOrDefault(a => StartOf(a) > posterT)
                    ?? cs.FirstOrDefault();
            return new ProjectSinkSummary(id, poster, MergeCoverage(cs, mergeGap));
        }).ToList();

        return new ProjectSummary(
            p.Id,
            p.Name,
            p.Start,
            p.End,
            p.UpdatedAt,
            clips.Count,
            clips.Count(a => flagged.Contains(a.Id)),
            sinks);
    }

    /// <summary>Expects clips ordered by start.</summary>
    private static List<CoverageSpan> MergeCoverage(List<Asset> clips, TimeSpan gap)
    {
        var spans = new List<CoverageSpan>();
        foreach (var a in clips)
        {
            var (start, end) = (StartOf(a), EndOf(a));
            if (spans.Count > 0 && spans[^1] is var last && last.Status == a.Status && start <= last.End + gap)
                spans[^1] = last with { End = end > last.End ? end : last.End };
            else
                spans.Add(new CoverageSpan(start, end, a.Status));
        }
        return spans;
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
