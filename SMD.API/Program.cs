using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using SMD.Application.Services.Documents;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services;
using SMD.Infrastructure.Services.Validation;
using SMD.Infrastructure.Services.Audit;
using SMD.Infrastructure.Services.Documents;
using SMD.Application.Services.Exports;
using SMD.Infrastructure.Services.Exports;
using SMD.Application.Services;
using SMD.Infrastructure.Services.Dashboard;


// Add services to the container.
var builder = WebApplication.CreateBuilder(args);
var jwtSettings = builder.Configuration.GetSection("Jwt");

builder.Services.AddDbContext<SmdDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"))
    .EnableSensitiveDataLogging()
    .LogTo(Console.WriteLine, LogLevel.Information));

/*
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // added new, ne production kjo duhet te jet true
        options.RequireHttpsMetadata = false;
        options.SaveToken = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings["Issuer"],
            ValidAudience = jwtSettings["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Key"]!))
        };
    });
*/

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.SaveToken = true;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,

            ValidIssuer = jwtSettings["Issuer"],
            ValidAudience = jwtSettings["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtSettings["Key"]!)
            ),

            ClockSkew = TimeSpan.FromMinutes(1) // nice p�r dev/prod
        };
    });

// Add controllers and services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
//builder.Services.AddScoped<IDocumentNumberService, DocumentNumberService>();

// Swagger with JWT support
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { 
        Title = "SMD API", 
        Version = "v1" 
    });

    // JWT Bearer definition
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Shkruaj: Bearer {token}"
    });

    //  JWT requirement
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});
// Authorization policies
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanConfirmDocuments", policy =>
        policy.RequireRole("Admin", "Manager", "Supervisor"));

    options.AddPolicy("CanEditMasterData", policy =>
        policy.RequireRole("Admin", "Manager"));

    options.AddPolicy("CanMoveStockDirectly", policy =>
        policy.RequireRole("Admin"));

    options.AddPolicy("CanExport", policy =>
        policy.RequireRole("Admin", "Manager", "Supervisor", "Worker"));

    options.AddPolicy("CanViewAuditLogs", policy =>
        policy.RequireRole("Admin"));

    options.AddPolicy("CanEditDocuments", policy =>
        policy.RequireRole("Worker", "Supervisor", "Manager", "Admin"));

    options.AddPolicy("CanManageUsers", policy =>
        policy.RequireRole("Admin"));
});

// AuditLogService
//builder.Services.AddControllers();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<SMD.Infrastructure.Services.Audit.AuditLogService>();

// DocumentValidationService
builder.Services.AddScoped<DocumentValidationService>();

// Dashboard service interface
builder.Services.AddScoped<IDashboardService, DashboardService>();

// document services interface
builder.Services.AddScoped<IDocumentNumberService, DocumentNumberService>();
builder.Services.AddScoped<IDocumentService, DocumentService>();

// EXPORT
builder.Services.AddScoped<IExportService, ExportService>();

// CORS policy for SMD UI
builder.Services.AddCors(options =>
{
    options.AddPolicy("SmdUi", p =>
        p.WithOrigins("http://localhost:5173")
         .AllowAnyHeader()
         .AllowAnyMethod()
         .WithExposedHeaders("Content-Disposition")
         .AllowCredentials()
    );
});

//app builder
var app = builder.Build();

// Enable Swagger UI in Development
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "SMD API v1"));
}
// shtova per testim te https
else if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

// Exception logging middleware (optional, keeps process throwing so you still see details)
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        Console.WriteLine("Unhandled exception while handling request:");
        Console.WriteLine(ex.ToString());
        throw;
    }
});

app.UseHttpsRedirection();

app.UseCors("SmdUi");
app.UseAuthentication();
app.UseAuthorization();

// redirect root to Swagger UI
app.MapGet("/", () => Results.Redirect("/swagger"));

app.MapControllers();

app.Run();
