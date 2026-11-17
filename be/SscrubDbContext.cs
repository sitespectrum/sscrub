using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SscrubServer.Models;

namespace SscrubServer;

public partial class SscrubDbContext(DbContextOptions<SscrubDbContext> options) : DbContext(options)
{
    public DbSet<Sink> Sinks { get; set; }
    public DbSet<Asset> Assets { get; set; }

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
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}

internal class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
