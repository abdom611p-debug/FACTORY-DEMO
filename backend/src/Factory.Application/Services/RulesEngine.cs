using System;
using System.Linq;
using System.Threading.Tasks;
using Factory.Domain.Entities;
using Factory.Domain.Enums;
using Factory.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Factory.Application.Services;

public class RulesEngine : IRulesEngine
{
    private readonly IFactoryDbContext _context;
    private const int DefaultCooldownSeconds = 30;

    public RulesEngine(IFactoryDbContext context)
    {
        _context = context;
    }

    public async Task ProcessAIEventAsync(AIEvent aiEvent)
    {
        var matchingRules = await _context.Rules
            .Where(r => r.IsEnabled && r.EventTypeCondition == aiEvent.EventType)
            .ToListAsync();

        foreach (var rule in matchingRules)
        {
            if (rule.Action == "CREATE_VIOLATION")
            {
                // Deduplication / Cooldown Check:
                // Prevent duplicate violation creation for the same Rule & Worker (or Camera) within 30 seconds
                var cooldownWindow = aiEvent.Timestamp.AddSeconds(-DefaultCooldownSeconds);

                bool recentViolationExists = await _context.Violations
                    .AnyAsync(v => v.RuleId == rule.Id
                        && ((aiEvent.WorkerId != null && v.WorkerId == aiEvent.WorkerId) || (aiEvent.WorkerId == null && v.AIEvent != null && v.AIEvent.CameraId == aiEvent.CameraId))
                        && v.DetectedAt >= cooldownWindow);

                if (recentViolationExists)
                {
                    // Skip duplicate violation creation to prevent DB explosion
                    continue;
                }

                var violation = new Violation
                {
                    RuleId = rule.Id,
                    AIEventId = aiEvent.Id,
                    WorkerId = aiEvent.WorkerId,
                    Type = rule.Name,
                    Severity = rule.Severity,
                    Status = ViolationStatus.PENDING,
                    DetectedAt = aiEvent.Timestamp,
                    EvidenceReference = aiEvent.EvidenceJson
                };
                
                _context.Violations.Add(violation);
            }
        }
        
        await _context.SaveChangesAsync();
    }
}

