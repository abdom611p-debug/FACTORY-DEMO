using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Factory.Application.Interfaces;

namespace Factory.Api.Controllers;

[ApiController]
[Route("api/workers")]
public class WorkersController : ControllerBase
{
    private readonly IFactoryDbContext _context;

    public WorkersController(IFactoryDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var workers = await _context.Workers.ToListAsync();
        return Ok(workers);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var worker = await _context.Workers.FindAsync(id);
        if (worker == null) return NotFound();
        return Ok(worker);
    }
}
