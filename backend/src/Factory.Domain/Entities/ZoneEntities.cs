using System;
using System.Collections.Generic;

namespace Factory.Domain.Entities;

public class Zone : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = "GENERAL";
    public string PolygonJson { get; set; } = string.Empty; 
    public string Status { get; set; } = "ACTIVE";
    
    public Guid AreaId { get; set; }
    public Area Area { get; set; } = null!;
    
    public ICollection<ZonePermission> Permissions { get; set; } = new List<ZonePermission>();
}

public class ZonePermission : BaseEntity
{
    public Guid ZoneId { get; set; }
    public Zone Zone { get; set; } = null!;
    
    public Guid WorkerId { get; set; }
    public Worker Worker { get; set; } = null!;
    
    public bool IsAllowed { get; set; } = true;
}
