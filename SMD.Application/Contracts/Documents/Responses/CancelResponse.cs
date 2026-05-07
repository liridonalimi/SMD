namespace SMD.Application.Contracts.Documents.Responses;
public record CancelResponse(Guid Id, string DocumentNo, string Status);
