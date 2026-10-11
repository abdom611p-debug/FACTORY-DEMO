using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Factory.Application.Interfaces;
using Factory.Domain.Enums;

namespace Factory.Api.Controllers;

public class UpdateViolationStatusRequest
{
    public int Status { get; set; }
}

[ApiController]
[Route("api/violations")]
public class ViolationsController : ControllerBase
{
    private readonly IFactoryDbContext _context;

    public ViolationsController(IFactoryDbContext context)
    {
        _context = context;
    }

    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateViolationStatusRequest request)
    {
        var violation = await _context.Violations.FindAsync(id);
        if (violation == null) return NotFound();

        violation.Status = (ViolationStatus)request.Status;
        violation.ReviewedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(violation);
    }
}
