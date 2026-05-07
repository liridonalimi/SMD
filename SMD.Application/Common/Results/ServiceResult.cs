using System;
using System.Collections.Generic;
using System.Text;

namespace SMD.Application.Common.Results
{
    public enum ServiceResultType
    {
        Ok,
        NotFound,
        BadRequest,
        Conflict
    }

    public record ServiceResult<T>(ServiceResultType Type, T? Data, string? Error)
    {
        public static ServiceResult<T> Ok(T data) => new(ServiceResultType.Ok, data, null);
        public static ServiceResult<T> NotFound(string error) => new(ServiceResultType.NotFound, default, error);
        public static ServiceResult<T> BadRequest(string error) => new(ServiceResultType.BadRequest, default, error);
        public static ServiceResult<T> Conflict(string error) => new(ServiceResultType.Conflict, default, error);
    }
}
