import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as iam from "@aws-cdk/aws-iam";
import * as logs from "@aws-cdk/aws-logs";
import * as cr from "@aws-cdk/custom-resources";
import customTaskDefinitionJson from '../../ecs-taskdef.json';
import {Construct} from "constructs";

export class FargateStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, time: number, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, appendPostfix("ecs-vpc"), {
            natGateways: 1,
            subnetConfiguration: [
                {
                    name: appendPostfix('public-subnet'),
                    subnetType: ec2.SubnetType.PUBLIC
                }
            ]
        });

        const cluster = new ecs.Cluster(this, appendPostfix("Cluster"), {
            vpc: vpc
        });

        //const taskDefinition = ecs.FargateTaskDefinition.fromFargateTaskDefinitionArn(this, "task-def", "arn:aws:ecs:us-east-1:505510851740:task-definition/fargate-task-definitionfff:2") as ecs.FargateTaskDefinition;

        const taskRole = new iam.Role(this, 'ecsTaskExecutionRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
        });
        taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'));

        const securityGroupName = appendPostfix("securityGroup");
        const securityGroup = new ec2.SecurityGroup(this, securityGroupName, {
            allowAllOutbound: true,
            securityGroupName: securityGroupName,
            vpc: vpc
        });

        securityGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

        const serviceLogGroup = new logs.LogGroup(this, appendPostfix("serviceLogGroup"), {
            logGroupName: appendPostfix("/ecs/serviceLogGroup"),
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });

        const serviceLogDriver = new ecs.AwsLogDriver({
            logGroup: serviceLogGroup,
            streamPrefix: appendPostfix("service")
        });

        // Dummy task definition, will be replaced by ARN of the existing task definition
        const taskDefinition = new ecs.TaskDefinition(this, "task", {
                compatibility: ecs.Compatibility.FARGATE,
                cpu: "256",
                memoryMiB: "512",
                networkMode: ecs.NetworkMode.AWS_VPC,
                executionRole: taskRole
            }
        );
        taskDefinition.addContainer("container", {
            image: ecs.ContainerImage.fromRegistry("505510851740.dkr.ecr.eu-central-1.amazonaws.com/app"),
            portMappings: [{containerPort: 80}],
            logging: serviceLogDriver
        });

        const service = new ecs.FargateService(this, "service", {
            cluster,
            desiredCount: 1,
            taskDefinition,
            securityGroups: [securityGroup],
            assignPublicIp: true
        });

        const taskName = createCustomResource(this, "taskName", "ECS", "listTasks", "taskArns.0", {
            "cluster": cluster.clusterArn
        });

        const eniId = createCustomResource(this, "eniId", "ECS", "describeTasks", "tasks.0.attachments.0.details.1.value", {
            "cluster": cluster.clusterArn,
            "tasks": [taskName.getResponseField("taskArns.0")]
        });

        const publicIp = createCustomResource(this, "publicIp", "EC2", "describeNetworkInterfaces", "NetworkInterfaces.0.Association.PublicIp", {
            NetworkInterfaceIds: [
                eniId.getResponseField("tasks.0.attachments.0.details.1.value")
            ]
        });

        new cdk.CfnOutput(this, 'publicIp', {
            value: publicIp.getResponseField("NetworkInterfaces.0.Association.PublicIp")
        });

        /*
                const customTaskDefinition = new cr.AwsCustomResource(
                    this,
                    appendPostfix("customFargateTaskDefinition"),
                    {
                        onCreate: {
                            service: "ECS",
                            action: "registerTaskDefinition",
                            outputPath: "taskDefinition.taskDefinitionArn",
                            parameters: {
                                "containerDefinitions": [
                                    {
                                        "essential": true,
                                        "image": "505510851740.dkr.ecr.eu-central-1.amazonaws.com/app:latest",
                                        "name": "nginx",
                                        "portMappings": [
                                            {
                                                "containerPort": 80,
                                                "hostPort": 80,
                                                "protocol": "tcp"
                                            }
                                        ]
                                    }
                                ],
                                "taskRoleArn": "arn:aws:iam::505510851740:role/FargateTestAppRole",
                                "executionRoleArn": "arn:aws:iam::505510851740:role/FargateTestAppRole",
                                "family": "fargate-task-definition",
                                "networkMode": "awsvpc",
                                "requiresCompatibilities": [
                                    "FARGATE"
                                ]
                            }
                            ,
                            physicalResourceId: cr.PhysicalResourceId.fromResponse(
                                "taskDefinition.taskDefinitionArn"
                            ),
                        },
                        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                            resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
                        }),
                    }
                );*/

        /*
          After creating the task definition custom resouce, update the
          fargate service to use the new task definition revision above.
          This will get around the current limitation of not being able to create
          ecs services with task definition arns.
        */

        /*(service.node.tryFindChild(
            "Service"
        ) as ecs.CfnService)?.addPropertyOverride(
            "TaskDefinition",
            customTaskDefinition.getResponseField("taskDefinition.taskDefinitionArn")
        );*/

        function appendPostfix(name: string): string {
            return `${name}-${time}`;
        }

        function createCustomResource(scope: Construct, name: string, service: string, action: string, path: string, parameters?: any): cr.AwsCustomResource {
            return new cr.AwsCustomResource(
                scope,
                appendPostfix(name),
                {
                    onCreate: {
                        service: service,
                        action: action,
                        outputPaths: [path],
                        parameters: parameters,
                        physicalResourceId: cr.PhysicalResourceId.fromResponse(path)
                    },
                    policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
                    }),
                }
            );
        }
    }
}
