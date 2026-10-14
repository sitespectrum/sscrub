using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SscrubServer.Migrations
{
    /// <inheritdoc />
    public partial class BasicDerivedInfo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Filmstrip_ObjectKey",
                table: "Assets",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ThumbnailKey",
                table: "Assets",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Filmstrip_ObjectKey",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "ThumbnailKey",
                table: "Assets");
        }
    }
}
