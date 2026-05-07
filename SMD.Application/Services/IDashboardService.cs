using SMD.Application.Contracts.Responses;

namespace SMD.Application.Services;

public interface IDashboardService
{
    Task<DashboardSummaryResponse> GetSummaryAsync(CancellationToken ct = default);
}
