namespace SMD.Application.Contracts.Documents.Audit;

public class AuditLogListItemResponse
{
    public Guid Id { get; init; }
    public DateTime CreatedAt { get; init; }
    public Guid UserId { get; init; }
    public string Action { get; init; } = default!;
    public string Entity { get; init; } = default!;
    public string EntityId { get; init; } = default!;
    public string? Details { get; init; }
    public string? IpAddress { get; init; }
}
