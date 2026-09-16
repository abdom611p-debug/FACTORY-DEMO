FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy solution and restore as distinct layers
COPY ["FactoryBackend.sln", "./"]
COPY ["src/Factory.Api/Factory.Api.csproj", "src/Factory.Api/"]
COPY ["src/Factory.Application/Factory.Application.csproj", "src/Factory.Application/"]
COPY ["src/Factory.Domain/Factory.Domain.csproj", "src/Factory.Domain/"]
COPY ["src/Factory.Infrastructure/Factory.Infrastructure.csproj", "src/Factory.Infrastructure/"]
COPY ["tests/Factory.UnitTests/Factory.UnitTests.csproj", "tests/Factory.UnitTests/"]
COPY ["tests/Factory.IntegrationTests/Factory.IntegrationTests.csproj", "tests/Factory.IntegrationTests/"]
RUN dotnet restore

# Copy everything else and build
COPY . .
WORKDIR "/src/src/Factory.Api"
RUN dotnet build "Factory.Api.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Factory.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Build runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Factory.Api.dll"]
