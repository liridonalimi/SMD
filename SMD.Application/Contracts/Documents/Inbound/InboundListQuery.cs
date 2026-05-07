using SMD.Domain.Enums;
//using Microsoft.AspNetCore.Mvc;

namespace SMD.Application.Contracts.Documents.Inbound;

public class InboundListQuery
{
    public DocumentStatus? Status { get; init; }
    public DateTime? From { get; init; }
    public DateTime? To { get; init; }
    public bool? EmptyOnly { get; init; }
    public bool? AttentionOnly { get; init; }
    public string? PaymentStatus { get; init; }
    public string? Q { get; init; }

  //  [FromQuery(Name = "sort")]
    public string Sort { get; init; } = "createdAt";

    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 10;
}
