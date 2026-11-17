using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SscrubServer.Migrations
{
    /// <summary>
    /// Index on a clip's effective start (capture time, else upload time) per sink,
    /// for the project list's window queries. EF can't model expression indexes,
    /// so it's raw SQL and isn't in the model snapshot. The expression must match
    /// what EF emits for <c>a.CaptureDate ?? a.UploadDate</c>, or SQLite won't use it.
    /// </summary>
    public partial class AssetStartIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """CREATE INDEX "IX_Assets_SinkId_Start" ON "Assets" ("SinkId", COALESCE("CaptureDate", "UploadDate"));""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DROP INDEX "IX_Assets_SinkId_Start";""");
        }
    }
}
