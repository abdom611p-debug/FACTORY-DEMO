namespace Factory.Domain.Enums;

public enum CameraSourceType
{
    DEMO_PHONE,
    WEBCAM,
    RTSP,
    IP_CAMERA
}

public enum ViolationStatus
{
    PENDING,
    CONFIRMED,
    DISMISSED,
    RESOLVED
}

public enum Severity
{
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}

public enum Roles
{
    SUPER_ADMIN,
    FACTORY_ADMIN,
    SAFETY_MANAGER,
    HR_MANAGER,
    SUPERVISOR,
    SECURITY,
    VIEWER
}

public enum NotificationType
{
    VIOLATION,
    SAFETY_ALERT,
    UNAUTHORIZED_ENTRY,
    SYSTEM,
    MAINTENANCE
}
