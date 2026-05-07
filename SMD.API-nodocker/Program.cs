using Microsoft.EntityFrameworkCore;
using SMD.Infrastructure;
using SMD.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

var smdCors = "SmdCors";

builder.Services.AddCors(options =>
{
    options.AddPolicy(smdCors, policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",   // Vite dev server
                "http://127.0.0.1:5173"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials(); // e lejojmë për auth/cookies (edhe nëse s'e përdor tani)
    });
});

builder.Services.AddDbContext<SmdDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection")));

// Add services to the container.
builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(smdCors);

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
