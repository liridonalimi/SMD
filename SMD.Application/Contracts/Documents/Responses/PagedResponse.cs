namespace SMD.Application.Contracts.Documents.Responses;

public record PagedResponse<T>(
    int Page,
    int PageSize,
    int Total,
    string Sort,
    IReadOnlyList<T> Items
);
