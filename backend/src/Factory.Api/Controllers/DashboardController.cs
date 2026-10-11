using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Factory.Application.Interfaces;

namespace Factory.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
public class DashboardController : ControllerBase
{
    private readonly IFactoryDbContext _context;

    public DashboardController(IFactoryDbContext context)
    {
        _context = context;
    }

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview()
    {
        var activeWorkersCount = await _context.Workers.CountAsync(); // simplified
        var violationsCount = await _context.Violations.CountAsync(v => v.Status == Factory.Domain.Enums.ViolationStatus.PENDING);
        var activeCamerasCount = await _context.Cameras.CountAsync(c => c.Status == "ONLINE");

        return Ok(new
        {
            ActiveWorkers = activeWorkersCount,
            PendingViolations = violationsCount,
            ActiveCameras = activeCamerasCount
        });
    }

    [HttpGet("violations")]
    public async Task<IActionResult> GetViolations()
    {
        var violations = await _context.Violations
            .Include(v => v.Worker)
            .Include(v => v.Rule)
            .OrderByDescending(v => v.DetectedAt)
            .Take(50)
            .ToListAsync();
            
        return Ok(violations);
    }
}
