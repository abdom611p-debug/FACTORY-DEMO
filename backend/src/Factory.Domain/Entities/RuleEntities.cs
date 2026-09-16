using System;
using Factory.Domain.Enums;

namespace Factory.Domain.Entities;

public class AIEvent : BaseEntity
{
    public string EventType { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public double Confidence { get; set; }
    
    public Guid? CameraId { get; set; }
    public Camera? Camera { get; set; }
    
    public Guid? WorkerId { get; set; }
    public Worker? Worker { get; set; }
    
    public Guid? ZoneId { get; set; }
    public Zone? Zone { get; set; }
    
    public string EvidenceJson { get; set; } = string.Empty;
}

public class Rule : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string EventTypeCondition { get; set; } = string.Empty; // e.g. "UNAUTHORIZED_ZONE_ENTRY"
    public string Action { get; set; } = "CREATE_VIOLATION";
    public Severity Severity { get; set; } = Severity.MEDIUM;
    public bool IsEnabled { get; set; } = true;
    
    // Optional scoping
    public Guid? DepartmentId { get; set; }
    public Guid? AreaId { get; set; }
}

public class Violation : BaseEntity
{
    public Guid RuleId { get; set; }
    public Rule Rule { get; set; } = null!;
    
    public Guid? AIEventId { get; set; }
    public AIEvent? AIEvent { get; set; }
    
    public Guid? WorkerId { get; set; }
    public Worker? Worker { get; set; }
    
    public string Type { get; set; } = string.Empty;
    public Severity Severity { get; set; }
    public ViolationStatus Status { get; set; } = ViolationStatus.PENDING;
    
    public DateTime DetectedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string ReviewedBy { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    
    public string EvidenceReference { get; set; } = string.Empty;
}

public class Incident : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Severity Severity { get; set; }
    public DateTime OccurredAt { get; set; }
}
