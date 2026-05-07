namespace SMD.Application.Contracts.Documents.Responses;

public record ConfirmResponse(Guid Id, string DocumentNo, string Status);
