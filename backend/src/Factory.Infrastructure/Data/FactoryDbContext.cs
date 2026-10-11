using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Factory.Domain.Entities;
using Factory.Domain.Identity;

using Factory.Application.Interfaces;

namespace Factory.Infrastructure.Data;

public class FactoryDbContext : IdentityDbContext<ApplicationUser>, IFactoryDbContext
{
    public FactoryDbContext(DbContextOptions<FactoryDbContext> options) : base(options) { }

    public DbSet<FactoryEntity> Factories { get; set; }
    public DbSet<Department> Departments { get; set; }
    public DbSet<Area> Areas { get; set; }
    
    public DbSet<Worker> Workers { get; set; }
    public DbSet<Shift> Shifts { get; set; }
    public DbSet<WorkerAssignment> WorkerAssignments { get; set; }
    public DbSet<WorkerFaceEmbedding> WorkerFaceEmbeddings { get; set; }
    
    public DbSet<Camera> Cameras { get; set; }
    public DbSet<Zone> Zones { get; set; }
    public DbSet<ZonePermission> ZonePermissions { get; set; }
    public DbSet<Machine> Machines { get; set; }
    
    public DbSet<Rule> Rules { get; set; }
    public DbSet<Violation> Violations { get; set; }
    public DbSet<AIEvent> AIEvents { get; set; }
    public DbSet<Incident> Incidents { get; set; }
    
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<AuditLog> AuditLogs { get; set; }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Worker Employee Code Index
        builder.Entity<Worker>()
            .HasIndex(w => w.EmployeeCode)
            .IsUnique();

        builder.Entity<Worker>()
            .HasIndex(w => w.DepartmentId);
            
        // AI Event Indexes
        builder.Entity<AIEvent>()
            .HasIndex(e => e.Timestamp);
            
        builder.Entity<AIEvent>()
            .HasIndex(e => e.EventType);
            
        // Violation Indexes
        builder.Entity<Violation>()
            .HasIndex(v => v.WorkerId);
            
        builder.Entity<Violation>()
            .HasIndex(v => v.Status);
            
        builder.Entity<Camera>()
            .HasIndex(c => c.AreaId);
            
        builder.Entity<Zone>()
            .HasIndex(z => z.AreaId);

        // One-to-Many relationships that might need cascade deletes configured explicitly
        // Default conventions are usually fine, but specifying keeps it safe.
    }
}
