using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SscrubServer.Models;

namespace SscrubServer;

public partial class SscrubDbContext(DbContextOptions<SscrubDbContext> options) : DbContext(options)
{
    public DbSet<Sink> Sinks { get; set; }
    public DbSet<Asset> Assets { get; set; }
    public DbSet<Project> Projects { get; set; }
    public DbSet<ProjectFlag> ProjectFlags { get; set; }
    public DbSet<ProjectMarker> ProjectMarkers { get; set; }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // SQLite drops DateTimeKind, so values came back Unspecified and were
        // serialized without a "Z". Everything is stored as UTC.
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        OnModelCreatingPartial(modelBuilder);

        modelBuilder.Entity<Sink>()
            .HasMany(x => x.Assets).WithOne(x => x.Sink)
            .HasForeignKey(x => x.SinkId);

        modelBuilder.Entity<Asset>()
            .HasOne(x => x.Sink).WithMany(x => x.Assets)
            .HasForeignKey(x => x.SinkId);

        modelBuilder.Entity<ProjectFlag>(e =>
        {
            e.HasKey(x => new { x.ProjectId, x.AssetId });
            e.HasOne(x => x.Project).WithMany(x => x.Flags)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Asset).WithMany()
                .HasForeignKey(x => x.AssetId).OnDelete(DeleteBehavior.Cascade);
            e.Property(x => x.Flag).HasConversion<string>();
        });

        modelBuilder.Entity<ProjectMarker>()
            .HasOne(x => x.Project).WithMany(x => x.Markers)
            .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}

internal class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
