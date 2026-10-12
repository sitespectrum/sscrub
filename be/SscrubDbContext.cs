using Microsoft.EntityFrameworkCore;
using SscrubServer.Models;

namespace SscrubServer;

public partial class SscrubDbContext(DbContextOptions<SscrubDbContext> options) : DbContext(options)
{
    public DbSet<Sink> Sinks { get; set; }
    public DbSet<Asset> Assets { get; set; }

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
