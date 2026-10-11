using System;
using System.Collections.Generic;

namespace Factory.Domain.Entities;

public class Worker : BaseEntity
{
    public string EmployeeCode { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Position { get; set; } = string.Empty;
    public string Status { get; set; } = "ACTIVE";
    
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
    
    public Guid? AssignedAreaId { get; set; }
    public Area? AssignedArea { get; set; }
    
    public Guid? ShiftId { get; set; }
    public Shift? Shift { get; set; }
    
    public ICollection<WorkerFaceEmbedding> FaceEmbeddings { get; set; } = new List<WorkerFaceEmbedding>();
    public ICollection<WorkerAssignment> Assignments { get; set; } = new List<WorkerAssignment>();
}

public class WorkerFaceEmbedding : BaseEntity
{
    public Guid WorkerId { get; set; }
    public Worker Worker { get; set; } = null!;
    
    public string EmbeddingJson { get; set; } = string.Empty; // Store as JSON string or use PGVector
}

public class Shift : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
}

public class WorkerAssignment : BaseEntity
{
    public Guid WorkerId { get; set; }
    public Worker Worker { get; set; } = null!;
    
    public Guid AreaId { get; set; }
    public Area Area { get; set; } = null!;
    
    public DateTime AssignmentDate { get; set; }
}
