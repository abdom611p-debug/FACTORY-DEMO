using System.Threading.Tasks;
using Factory.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Factory.Application.Interfaces;

public interface IFactoryDbContext
{
    DbSet<Rule> Rules { get; }
    DbSet<Violation> Violations { get; }
    DbSet<Worker> Workers { get; }
    DbSet<Camera> Cameras { get; }
    DbSet<AIEvent> AIEvents { get; }
    
    Task<int> SaveChangesAsync(System.Threading.CancellationToken cancellationToken = default);
}
