using System;
using System.Linq;
using System.Threading.Tasks;
using Factory.Domain.Entities;
using Factory.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Factory.Infrastructure.Data;

public static class SeedData
{
    public static async Task InitializeAsync(FactoryDbContext context)
    {
        // For development, apply migrations immediately
        await context.Database.MigrateAsync();

        if (context.Factories.Any())
        {
            return; // DB has been seeded
        }

        var factory = new FactoryEntity
        {
            Name = "Demo Factory",
            Location = "Industrial Park A"
        };
        context.Factories.Add(factory);
        await context.SaveChangesAsync();

        var depts = new[]
        {
            new Department { Name = "Production", FactoryId = factory.Id },
            new Department { Name = "Maintenance", FactoryId = factory.Id },
            new Department { Name = "Warehouse", FactoryId = factory.Id },
            new Department { Name = "Safety", FactoryId = factory.Id }
        };
        context.Departments.AddRange(depts);
        await context.SaveChangesAsync();

        var prodDept = depts[0];
        var whDept = depts[2];
        var maintDept = depts[1];

        var areas = new[]
        {
            new Area { Name = "Production A", DepartmentId = prodDept.Id },
            new Area { Name = "Production B", DepartmentId = prodDept.Id },
            new Area { Name = "Warehouse A", DepartmentId = whDept.Id },
            new Area { Name = "Maintenance A", DepartmentId = maintDept.Id },
            new Area { Name = "Parking", DepartmentId = maintDept.Id }
        };
        context.Areas.AddRange(areas);
        await context.SaveChangesAsync();

        var prodArea = areas[0];
        
        var zones = new[]
        {
            new Zone { Name = "Normal zone", AreaId = prodArea.Id, PolygonJson = "[[0,0], [10,0], [10,10], [0,10]]" },
            new Zone { Name = "Restricted zone", AreaId = prodArea.Id, Type = "RESTRICTED", PolygonJson = "[[20,20], [30,20], [30,30], [20,30]]" }
        };
        context.Zones.AddRange(zones);

        var workers = new[]
        {
            new Worker { EmployeeCode = "W-001", FullName = "John Doe", DepartmentId = prodDept.Id, Position = "Operator" },
            new Worker { EmployeeCode = "W-002", FullName = "Jane Smith", DepartmentId = maintDept.Id, Position = "Technician" },
            new Worker { EmployeeCode = "W-003", FullName = "Mike Johnson", DepartmentId = whDept.Id, Position = "Forklift Driver" },
            new Worker { EmployeeCode = "W-004", FullName = "Emily Davis", DepartmentId = prodDept.Id, Position = "Supervisor" },
            new Worker { EmployeeCode = "W-005", FullName = "Chris Wilson", DepartmentId = prodDept.Id, Position = "Operator" }
        };
        context.Workers.AddRange(workers);

        var rules = new[]
        {
            new Rule { Name = "Helmet missing", EventTypeCondition = "PPE_MISSING", Action = "CREATE_VIOLATION", Severity = Severity.HIGH },
            new Rule { Name = "Unauthorized area", EventTypeCondition = "UNAUTHORIZED_ZONE_ENTRY", Action = "CREATE_VIOLATION", Severity = Severity.CRITICAL },
            new Rule { Name = "Worker leaves assigned area", EventTypeCondition = "PERSON_LEFT_ASSIGNED_ZONE", Action = "CREATE_VIOLATION", Severity = Severity.MEDIUM },
            new Rule { Name = "Vehicle detected", EventTypeCondition = "VEHICLE_DETECTED", Action = "LOG_EVENT", Severity = Severity.LOW }
        };
        context.Rules.AddRange(rules);
        
        var cameras = new[]
        {
            new Camera { Name = "Prod Cam 1", AreaId = prodArea.Id, SourceType = CameraSourceType.DEMO_PHONE, Status = "ONLINE" },
            new Camera { Name = "Warehouse Cam 1", AreaId = areas[2].Id, SourceType = CameraSourceType.IP_CAMERA, Status = "ONLINE" }
        };
        context.Cameras.AddRange(cameras);

        await context.SaveChangesAsync();
    }
}
