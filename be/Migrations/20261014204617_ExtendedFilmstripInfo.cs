using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SscrubServer.Migrations
{
    /// <inheritdoc />
    public partial class ExtendedFilmstripInfo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Filmstrip_Columns",
                table: "Assets",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Filmstrip_FrameCount",
                table: "Assets",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Filmstrip_FrameHeight",
                table: "Assets",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Filmstrip_FrameWidth",
                table: "Assets",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "Filmstrip_IntervalMillis",
                table: "Assets",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Filmstrip_Columns",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "Filmstrip_FrameCount",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "Filmstrip_FrameHeight",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "Filmstrip_FrameWidth",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "Filmstrip_IntervalMillis",
                table: "Assets");
        }
    }
}
