using Microsoft.AspNetCore.SignalR;

namespace Factory.Api.Hubs;

public class LiveEventHub : Hub
{
    // Clients will connect here to receive real-time notifications
    // E.g. _hubContext.Clients.All.SendAsync("AI_EVENT_RECEIVED", eventDto);
}
