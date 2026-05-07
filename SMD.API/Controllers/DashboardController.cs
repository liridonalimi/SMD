using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SMD.Application.Services;

namespace SMD.API.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize] // dashboard është secure (enterprise)
public class DashboardController : ControllerBase
{
    private readonly IDashboardService _dashboard;

    public DashboardController(IDashboardService dashboard)
    {
        _dashboard = dashboard;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct)
    {
        var data = await _dashboard.GetSummaryAsync(ct);
        return Ok(data);
    }
}
