using Microsoft.EntityFrameworkCore;

namespace SscrubServer;

public partial class SscrubDbContext(DbContextOptions<SscrubDbContext> options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
