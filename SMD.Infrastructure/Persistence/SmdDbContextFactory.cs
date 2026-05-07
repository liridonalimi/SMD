using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SMD.Infrastructure.Persistence;

public class SmdDbContextFactory : IDesignTimeDbContextFactory<SmdDbContext>
{
    public SmdDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Server=(localdb)\\MSSQLLocalDB.;Database=SMD_DB;Trusted_Connection=True;TrustServerCertificate=True";

        var options = new DbContextOptionsBuilder<SmdDbContext>()
            .UseSqlServer(connectionString)
            .Options;

        return new SmdDbContext(options);
    }
}
