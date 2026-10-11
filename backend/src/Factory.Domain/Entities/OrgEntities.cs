using System;
using System.Collections.Generic;

namespace Factory.Domain.Entities;

public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}

public class FactoryEntity : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    
    public ICollection<Department> Departments { get; set; } = new List<Department>();
}

public class Department : BaseEntity
{
    public Guid FactoryId { get; set; }
    public FactoryEntity Factory { get; set; } = null!;
    
    public string Name { get; set; } = string.Empty;
    
    public ICollection<Area> Areas { get; set; } = new List<Area>();
    public ICollection<Worker> Workers { get; set; } = new List<Worker>();
}

public class Area : BaseEntity
{
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
    
    public string Name { get; set; } = string.Empty;
    
    public ICollection<Camera> Cameras { get; set; } = new List<Camera>();
    public ICollection<Zone> Zones { get; set; } = new List<Zone>();
    public ICollection<Machine> Machines { get; set; } = new List<Machine>();
}
