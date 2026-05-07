using Microsoft.AspNetCore.Mvc;
using SMD.Application.Common.Results;

namespace SMD.API.Extensions
{
    public static class ServiceResultExtensions
    {
        public static IActionResult ToActionResult<T>(this ControllerBase controller, ServiceResult<T> result)
        {
            return result.Type switch
            {
                ServiceResultType.Ok => controller.Ok(result.Data),
                ServiceResultType.NotFound => controller.NotFound(result.Error),
                ServiceResultType.BadRequest => controller.BadRequest(result.Error),
                ServiceResultType.Conflict => controller.Conflict(result.Error),
                _ => controller.StatusCode(500, "Unexpected error.")
            };
        }
    }
}
