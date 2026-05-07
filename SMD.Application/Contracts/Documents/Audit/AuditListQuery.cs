//using SMD.Domain.Enums;

namespace SMD.Application.Contracts.Documents.Audit;

public class AuditListQuery
{
    public DateTime? From { get; init; }
    public DateTime? To { get; init; }

    public string? Q { get; init; }

    public string? Action { get; init; }
    public Guid? UserId { get; init; }
    public string Sort { get; init; } = "createdat_desc";

    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
}
