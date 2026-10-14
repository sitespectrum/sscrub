using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SscrubServer.Migrations
{
    /// <inheritdoc />
    public partial class ExtendSink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Color",
                table: "Sinks",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Model",
                table: "Sinks",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "Sinks",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Color",
                table: "Sinks");

            migrationBuilder.DropColumn(
                name: "Model",
                table: "Sinks");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "Sinks");
        }
    }
}
