using System;
using Factory.Domain.Enums;

namespace Factory.Domain.Entities;

public class Camera : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    
    public Guid AreaId { get; set; }
    public Area Area { get; set; } = null!;
    
    public CameraSourceType SourceType { get; set; }
    public string SourceUrl { get; set; } = string.Empty;
    public string Status { get; set; } = "ONLINE";
}

public class Machine : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public Guid AreaId { get; set; }
    public Area Area { get; set; } = null!;
    public string Status { get; set; } = "OPERATIONAL";
}
