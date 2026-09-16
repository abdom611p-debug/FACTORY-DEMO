using System;
using Factory.Domain.Enums;

namespace Factory.Domain.Entities;

public class Notification : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public NotificationType Type { get; set; }
    public bool IsRead { get; set; } = false;
    public string RecipientUserId { get; set; } = string.Empty;
}

public class AuditLog : BaseEntity
{
    public string Action { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Changes { get; set; } = string.Empty;
}
