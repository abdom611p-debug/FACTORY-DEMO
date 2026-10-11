using System.Threading.Tasks;
using Factory.Domain.Entities;

namespace Factory.Application.Interfaces;

public interface IRulesEngine
{
    Task ProcessAIEventAsync(AIEvent aiEvent);
}

public interface IEventProcessor
{
    Task HandleIncomingEventAsync(AIEvent aiEvent);
}

public interface IAIEngineClient
{
    Task<bool> PingAsync();
}
