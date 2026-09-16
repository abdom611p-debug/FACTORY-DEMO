using System.Threading.Tasks;
using Factory.Domain.Entities;
using Factory.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Factory.Application.Services;

public class EventProcessor : IEventProcessor
{
    private readonly IFactoryDbContext _context;
    private readonly IRulesEngine _rulesEngine;

    public EventProcessor(IFactoryDbContext context, IRulesEngine rulesEngine)
    {
        _context = context;
        _rulesEngine = rulesEngine;
    }

    public async Task HandleIncomingEventAsync(AIEvent aiEvent)
    {
        // 1. Save the event
        _context.AIEvents.Add(aiEvent);
        await _context.SaveChangesAsync();

        // 2. Pass to Rules Engine
        await _rulesEngine.ProcessAIEventAsync(aiEvent);
        
        // 3. Real-time notification would happen here (SignalR) - typically dispatched via MediatR or a direct HubContext injection.
    }
}
