using System.Threading.Tasks;
using Factory.Application.Interfaces;
using Factory.Domain.Entities;
using Factory.Api.Hubs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace Factory.Api.Controllers;

[ApiController]
[Route("api/ai/events")]
public class AIEventsController : ControllerBase
{
    private readonly IEventProcessor _eventProcessor;
    private readonly IHubContext<LiveEventHub> _hubContext;

    public AIEventsController(IEventProcessor eventProcessor, IHubContext<LiveEventHub> hubContext)
    {
        _eventProcessor = eventProcessor;
        _hubContext = hubContext;
    }

    [HttpPost]
    public async Task<IActionResult> PostAIEvent([FromBody] AIEvent aiEvent)
    {
        if (aiEvent == null) return BadRequest();

        // 1. Process Event and Generate Violations
        await _eventProcessor.HandleIncomingEventAsync(aiEvent);

        // 2. Broadcast via SignalR to Dashboard
        await _hubContext.Clients.All.SendAsync("AI_EVENT_RECEIVED", aiEvent);

        return Ok(new { status = "processed" });
    }
}
